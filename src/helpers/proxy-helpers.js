import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import fetch from "axios";
import pAll from "p-all";

import log from "./log.js";
import options from "../options.js";

/**
 * Get proxy list from repo
 *
 * @return  {Array}  Proxies array list
 */
export async function getProxyList() {
    let proxies = [];

    try {
        const fileRequest = await fetch(
            "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt"
        );

        const fileData = await fileRequest.text();

        proxies = fileData.split("\n").filter(function (item) {
            return item.length;
        });

        proxies = proxies.slice(proxies.length - 100);
    } catch (error) {
        console.log(error);
    }

    return proxies;
}

/**
 * Filter proxy list
 *
 * @param   {Array}  data          Input proxies array
 *
 * @return  {Array}                Filtered proxies array
 */
export async function filterProxyList(data = getProxyList(), delay = 500) {
    const resultData = [];
    const actions = [];

    const proxyCachePath = path.resolve(
        options.directory,
        "./proxy-cache.json"
    );
    let proxyCache = {};

    if (fs.existsSync(proxyCachePath) && !options.forceProxy) {
        proxyCache = JSON.parse(fs.readFileSync(proxyCachePath));
    } else {
        // clear proxy cache
        fs.writeFileSync(proxyCachePath, JSON.stringify({}));
    }

    for (const item in proxyCache) {
        if (proxyCache[item]) {
            resultData.push(item);

            if (data.indexOf(item) != -1) {
                data[data.indexOf(item)] = null;
            }
        }
    }

    // filter data before process
    data = data.filter(function (item) {
        return item;
    });

    log(`Found ${data.length} proxies for test`);

    for (const item of data) {
        const [ip, port] = item.split(":");

        actions.push(async () => {
            log(`Test proxy ${ip}:${port}`);

            const result = await new Promise(function (resolve) {
                const sock = new net.Socket();

                sock.setTimeout(delay);

                sock.on("connect", function () {
                    log(`Proxy ${ip}:${port} connected`);

                    sock.destroy();

                    proxyCache[item] = true;
                    fs.writeFileSync(
                        proxyCachePath,
                        JSON.stringify(proxyCache, null, 4)
                    );

                    resolve(item);
                })
                    .on("error", function (e) {
                        log(`Proxy ${ip}:${port} error: ${e.message}`);

                        proxyCache[item] = false;
                        fs.writeFileSync(
                            proxyCachePath,
                            JSON.stringify(proxyCache, null, 4)
                        );

                        resolve(null);
                    })
                    .on("timeout", function () {
                        log(`Proxy ${ip}:${port} timeout`);

                        proxyCache[item] = false;
                        fs.writeFileSync(
                            proxyCachePath,
                            JSON.stringify(proxyCache, null, 4)
                        );

                        resolve(null);
                    })
                    .connect(port, ip);
            });

            if (result) {
                resultData.push(result);
            }
        });
    }

    await pAll(actions, {
        concurrency: 10,
    });

    return resultData;
}

export default {
    getProxyList,
    filterProxyList,
};
