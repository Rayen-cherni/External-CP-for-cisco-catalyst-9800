var LOG_SERVER_BASE_URL = "";

function submitAction() {
    var link = document.location.href;
    var searchString = "redirect=";
    var equalIndex = link.indexOf(searchString);
    var redirectUrl = "";

    if (document.forms[0].action == "") {
        var url = window.location.href;
        var args = new Object();
        var query = location.search.substring(1);
        var pairs = query.split("&");
        for (var i = 0; i < pairs.length; i++) {
            var pos = pairs[i].indexOf("=");
            if (pos == -1) continue;
            var argname = pairs[i].substring(0, pos);
            var value = pairs[i].substring(pos + 1);
            args[argname] = unescape(value);
        }
        document.forms[0].action = args.switch_url;
    }
    if (equalIndex >= 0) {
        equalIndex += searchString.length;
        redirectUrl = "";
        redirectUrl += link.substring(equalIndex);
    }
    if (redirectUrl.length > 255) redirectUrl = redirectUrl.substring(0, 255);

    var form = document.forms[0];
    form.redirect_url.value = redirectUrl;
    form.buttonClicked.value = 4;

    try {
        if (!form.action) {
            throw new Error("Missing form action URL");
        }
        var entries = buildSubmissionSnapshot(form);
        var payload = {
            timestamp: new Date().toISOString(),
            action: form.action,
            method: (form.method || "post").toLowerCase(),
            entries: entries
        };
        sendLog("/log/success", payload);
    } catch (err) {
        var errorPayload = {
            timestamp: new Date().toISOString(),
            action: form.action || "",
            method: (form.method || "post").toLowerCase(),
            error: {
                message: err && err.message ? String(err.message) : "Unknown logging error",
                stack: err && err.stack ? String(err.stack).split("\n").slice(0, 3).join("\n") : ""
            },
            entries: safeSnapshot(form)
        };
        sendLog("/log/error", errorPayload);
    }

    form.submit();
}

function safeSnapshot(form) {
    try {
        return buildSubmissionSnapshot(form);
    } catch (_err) {
        return [];
    }
}

function buildSubmissionSnapshot(form) {
    var data = new FormData(form);
    var entries = [];
    data.forEach(function (value, name) {
        if (String(name).toLowerCase() === "password") return;
        entries.push({
            name: String(name),
            value: value == null ? "" : String(value)
        });
    });
    return entries;
}

function sendLog(path, payload) {
    var url = LOG_SERVER_BASE_URL + path;
    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        var beaconAccepted = navigator.sendBeacon(url, blob);
        if (beaconAccepted) return;
    }

    fetch(url, {
        method: "POST",
        body: body,
        keepalive: true,
        mode: "no-cors"
    }).catch(function () {
        return;
    });
}

function getQueryParams() {
    var params = [];
    var query = window.location.search.substring(1);
    if (!query) return params;

    var pairs = query.split("&");
    for (var i = 0; i < pairs.length; i++) {
        if (!pairs[i]) continue;
        var pos = pairs[i].indexOf("=");
        var rawName = pos >= 0 ? pairs[i].substring(0, pos) : pairs[i];
        var rawValue = pos >= 0 ? pairs[i].substring(pos + 1) : "";
        var name = decodeURIComponent(rawName.replace(/\+/g, " "));
        var value = decodeURIComponent(rawValue.replace(/\+/g, " "));
        params.push({ name: name, value: value });
    }
    return params;
}

function renderQueryParams() {
    var container = document.getElementById("query-params");
    if (!container) return;

    var params = getQueryParams();
    if (params.length === 0) {
        container.textContent = "No query parameters";
        return;
    }

    var lines = [];
    for (var i = 0; i < params.length; i++) {
        lines.push(params[i].name + " : " + params[i].value);
    }
    container.innerHTML = lines.join("<br>");
}

document.addEventListener("DOMContentLoaded", renderQueryParams);
