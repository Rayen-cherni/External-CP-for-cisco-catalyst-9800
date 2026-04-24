const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8787;
const HOST = "0.0.0.0";
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

const SUCCESS_LOG_PATH = path.join(__dirname, "success.log");
const ERROR_LOG_PATH = path.join(__dirname, "error.log");

function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];

        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_SIZE) {
                reject(new Error("Request body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on("end", () => {
            resolve(Buffer.concat(chunks).toString("utf8"));
        });
        req.on("error", reject);
    });
}

function parseJson(body) {
    if (!body) return {};
    try {
        return JSON.parse(body);
    } catch {
        return { rawBody: body };
    }
}

function formatEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return "(empty)";
    return entries
        .map((entry) => `${entry.name} : ${entry.value}`)
        .join("\n");
}

function formatSuccessLog(payload) {
    const lines = [];
    lines.push("--- SUCCESS ATTEMPT ---");
    lines.push(`timestamp : ${payload.timestamp || new Date().toISOString()}`);
    lines.push(`status : attempt`);
    lines.push(`action : ${payload.action || ""}`);
    lines.push(`method : ${payload.method || "post"}`);
    lines.push("entries:");
    lines.push(formatEntries(payload.entries));
    lines.push("");
    return lines.join("\n");
}

function formatErrorLog(payload) {
    const lines = [];
    lines.push("--- ERROR ---");
    lines.push(`timestamp : ${payload.timestamp || new Date().toISOString()}`);
    lines.push(`status : error`);
    lines.push(`action : ${payload.action || ""}`);
    lines.push(`method : ${payload.method || "post"}`);
    if (payload.error && payload.error.message) {
        lines.push(`error_message : ${payload.error.message}`);
    } else {
        lines.push("error_message : Unknown error");
    }
    if (payload.error && payload.error.stack) {
        lines.push("error_stack:");
        lines.push(String(payload.error.stack));
    }
    lines.push("entries:");
    lines.push(formatEntries(payload.entries));
    lines.push("");
    return lines.join("\n");
}

function appendLog(filePath, content) {
    return fs.promises.appendFile(filePath, content, "utf8");
}

const server = http.createServer(async (req, res) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end("Method Not Allowed");
        return;
    }

    if (req.url !== "/log/success" && req.url !== "/log/error") {
        res.statusCode = 404;
        res.end("Not Found");
        return;
    }

    try {
        const body = await readRequestBody(req);
        const payload = parseJson(body);

        if (req.url === "/log/success") {
            await appendLog(SUCCESS_LOG_PATH, formatSuccessLog(payload));
        } else {
            await appendLog(ERROR_LOG_PATH, formatErrorLog(payload));
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
    } catch (err) {
        const fallbackLog = formatErrorLog({
            timestamp: new Date().toISOString(),
            action: "",
            method: "post",
            error: { message: err.message || "Server error", stack: err.stack || "" },
            entries: []
        });

        try {
            await appendLog(ERROR_LOG_PATH, fallbackLog);
        } catch {
            // Ignore secondary logging failure to avoid crashing the server.
        }

        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: false, error: "Internal Server Error" }));
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Logger server listening at http://127.0.0.1:${PORT}`);
});
