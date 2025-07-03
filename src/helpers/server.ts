import { workspace as VscodeWorkspace } from "vscode";

const http = require("http");
const connect = require("connect");
const fs = require("fs");
const path = require("path");
const morgan = require("morgan");
const zlib = require("zlib");

let app = connect();
var httpProxy = require("http-proxy");

// Configuration
const configs = VscodeWorkspace.getConfiguration("vs-browser");
const HOST = "localhost";
const PORT = configs.get<number>("localProxyServer.port") || 9999;
const cookieDomainRewrite =
  configs.get<boolean>("localProxyServer.cookieDomainRewrite") || false;
export let status = 0;
export let online = 0;
export let runningPort = 9999;
let serverInstance: any = null;

var proxy = httpProxy.createProxyServer();

proxy.on("proxyReq", (proxyReq: any, req: any) => {
  try {
    if (req.body) {
      const bodyData = JSON.stringify(req.body);
      // incase if content-type is application/x-www-form-urlencoded -> we need to change to application/json
      proxyReq.setHeader("Content-Type", "application/json");
      proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyData));
      // stream the content
      proxyReq.write(bodyData);
    }
  } catch (error) {
    console.error("Error in proxyReq handler:", error);
  }
});

proxy.on("error", (err: any, req: any, res: any) => {
  console.error("Proxy error:", err);
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.write("Bad Gateway - Proxy Error");
    res.end();
  }
});

proxy.on("proxyRes", function (proxyRes: any, req: any, res: any) {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Frame-Options", false);
    if (proxyRes.headers["content-type"]) {
      res.setHeader("Content-Type", proxyRes.headers["content-type"]);
    }

    proxyRes = decompress(proxyRes, proxyRes.headers["content-encoding"]);

    var buffer = Buffer.from("", "utf8");
    proxyRes.on(
      "data",
      (chunk: any) => {
        try {
          buffer = Buffer.concat([buffer, chunk]);
        } catch (error) {
          console.error("Error processing chunk:", error);
        }
      }
    );

    let body: any = null;
    proxyRes.on("end", function () {
      try {
        body = buffer.toString("utf8");

        if (
          res.hasHeader("Content-Type") &&
          res.getHeader("Content-Type").toString().match(/([^;]+)*/g)?.[0] === "text/html"
        ) {
          let url = req.originalUrl;
          let regex = /(https?):\/\/([^\/]+)/;
          const match = url.match(regex);
          if (match) {
            url = match[0];
          }
          // Commented out URL rewriting for now - can be enabled if needed
        } else if (
          res.hasHeader("Content-Type") &&
          (res.getHeader("Content-Type").toString().match(/([^;]+)*/g)?.[0] === "text/css" ||
            res.getHeader("Content-Type").toString().match(/([^;]+)*/g)?.[0] ===
              "text/javascript")
        ) {
          let url = req.originalUrl;
          let regex = /(https?):\/\/([^\/]+)/;
          const match = url.match(regex);
          if (match) {
            url = match[0];
            body = body.replaceAll(
              /(https?:\/\/(?!'|"))/g,
              "http://" + HOST + ":" + PORT + "/$1"
            );
          }
        }
        body = Buffer.from(body, "utf8");
        res.write(body);
        res.end();
      } catch (error) {
        console.error("Error processing response body:", error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.write("Error processing response");
          res.end();
        }
      }
    });

    proxyRes.on("error", (error: any) => {
      console.error("ProxyRes stream error:", error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.write("Stream error");
        res.end();
      }
    });

    if (
      proxyRes.statusCode === 301 ||
      proxyRes.statusCode === 302 ||
      proxyRes.headers.location
    ) {
      res.writeHead(proxyRes.statusCode || 302, {
        location: "http://" + HOST + ":" + PORT + "/" + proxyRes.headers.location,
      });
      res.end();
    }
  } catch (error) {
    console.error("Error in proxyRes handler:", error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.write("Internal proxy error");
      res.end();
    }
  }
});

export function start(callback: Function = () => {}) {
  if (status === 0 || PORT !== runningPort) {
    console.log("Local proxy server starting on port " + PORT);

    // Create the express app
    app.use(morgan("dev"));

    app.use(function (req: any, res: any) {
      try {
        let options = {
          target: null,
          ssl: {
            key: null as any,
            cert: null as any,
          },
          xfwd: true,
          secure: false,
          changeOrigin: true,
          hostRewrite: true,
          autoRewrite: true,
          toProxy: true,
          cookieDomainRewrite: "",
          selfHandleResponse: true,
        };

        // Load SSL certificates synchronously with error handling
        try {
          const keyPath = path.resolve(__dirname, "ssl/key.pem");
          const certPath = path.resolve(__dirname, "ssl/cert.pem");
          
          if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            options.ssl.key = fs.readFileSync(keyPath);
            options.ssl.cert = fs.readFileSync(certPath);
          } else {
            console.warn("SSL certificates not found, proceeding without SSL");
          }
        } catch (sslError) {
          console.error("Error loading SSL certificates:", sslError);
        }

        // Set the default response headers
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("X-Frame-Options", false);

        let url = req.url;
        let regex = /^(https?):\/\/([^\/]+)/;
        const match = url.match(regex);
        
        if (match) {
          url = match[0];
          
          // Validate URL to prevent SSRF attacks
          try {
            const urlObj = new URL(url);
            // Block internal/local addresses
            const hostname = urlObj.hostname.toLowerCase();
            if (hostname === 'localhost' || 
                hostname === '127.0.0.1' || 
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.')) {
              res.writeHead(403, { 'Content-Type': 'text/html' });
              res.write("Access to internal addresses is forbidden");
              res.end();
              return;
            }
          } catch (urlError) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.write("Invalid URL format");
            res.end();
            return;
          }

          options.target = url;
          if (cookieDomainRewrite) {
            options.cookieDomainRewrite = url;
          }
          req.url = "/" + req.url.split("/").slice(3).join("/");

          proxy.web(req, res, options);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.write("Invalid request - URL must start with http:// or https://");
          res.end();
        }
      } catch (error) {
        console.error("Error in proxy request handler:", error);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.write("Internal server error");
        res.end();
      }
    });

    const server = http.createServer(app);
    serverInstance = server;
    
    server.listen(PORT, function () {
      status = 1;
      online++;
      runningPort = PORT;
      console.log("Local proxy server started on port " + PORT);
      callback();
    });

    server.on('error', function(err: any) {
      console.error("Failed to start proxy server:", err);
      status = 0;
      serverInstance = null;
      callback(err);
    });
  } else {
    console.log("Local proxy server already started on port " + PORT);
    online++;
    callback();
  }
}

export function stop(callback: Function = () => {}) {
  online--;
  if (status === 1 && online === 0) {
    console.log("Stopping local proxy server");

    try {
      // Close the proxy server
      if (proxy && typeof proxy.close === 'function') {
        proxy.close(() => {
          console.log("Proxy server stopped");
        });
      }

      // Close the HTTP server
      if (serverInstance) {
        serverInstance.close((err: any) => {
          if (err) {
            console.error("Error closing server:", err);
          }
          status = 0;
          serverInstance = null;
          console.log("Local proxy server stopped");
          callback();
        });
      } else {
        status = 0;
        console.log("No server instance to close");
        callback();
      }
    } catch (error) {
      console.error("Error stopping proxy server:", error);
      status = 0;
      serverInstance = null;
      callback(error);
    }
  } else {
    console.log(
      "There are still " +
        online +
        " connects so the proxy server will not be closed"
    );
    callback();
  }
}

function decompress(proxyRes: any, contentEncoding: string) {
  let _proxyRes = proxyRes;
  let decompress;

  switch (contentEncoding) {
    case "gzip":
      decompress = zlib.createGunzip();
      break;
    case "br":
      decompress = zlib.createBrotliDecompress();
      break;
    case "deflate":
      decompress = zlib.createInflate();
      break;
    default:
      break;
  }

  if (decompress) {
    _proxyRes.pipe(decompress);
    _proxyRes = decompress;
  }

  return _proxyRes;
}
