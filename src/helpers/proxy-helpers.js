import net from "node:net";
import path from "node:path";

import axios from "axios";
import pAll from "p-all";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import log from "./log.js";
import options from "../options.js";

const dbPath = path.resolve(options.directory, "db");

const proxyAdapter = new JSONFileSync(path.resolve(dbPath, "proxy.json"));
const proxyDb = new LowSync(proxyAdapter);

proxyDb.read();

if (!proxyDb.data) {
    proxyDb.data = [];
    proxyDb.write();
}

/**
 * Get random proxy config
 *
 * @param   {Boolean}  force  Force get flag
 *
 * @return  {Object}          Proxy settings
 */
export async function getProxy(force = false) {
    if (!options.proxy && !force) {
        return false;
    }

    if (!proxyDb.data.length) {
        return false;
    }

    proxyDb.read();

    const randomProxy = proxyDb.data
        .map((item) => item)
        .sort(() => Math.random() - Math.random())[0];

    const [host, port] = randomProxy.split(":");

    log(`Try with ${host}:${port} as random proxy`);

    return {
        protocol: "http",
        host,
        port,
    };
}

/**
 * Get proxy list from repo
 *
 * @return  {Array}  Proxies array list
 */
export async function getProxyList() {
    let proxies = [];

    try {
        const fileRequest = await axios(
            "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
            {
                responseType: "text",
            }
        );

        proxies = fileRequest.data.split("\n").filter((item) => item.length);

        proxies = proxies.slice(proxies.length - 100);
    } catch (error) {
        log(error.message);
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

    // filter data before process
    data = data.filter((item) => item);

    log(`Found ${data.length} proxies for test`);

    for (const item of data) {
        const [ip, port] = item.split(":");

        actions.push(async () => {
            log(`Test proxy ${ip}:${port}`);

            const result = await new Promise((resolve) => {
                const sock = new net.Socket();

                sock.setTimeout(delay);

                sock.on("connect", () => {
                    log(`Proxy ${ip}:${port} connected`);

                    sock.destroy();
                    resolve(item);
                })
                    .on("error", (e) => {
                        log(`Proxy ${ip}:${port} error: ${e.message}`);

                        sock.destroy();
                        resolve(null);
                    })
                    .on("timeout", () => {
                        log(`Proxy ${ip}:${port} timeout`);

                        sock.destroy();
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

/**
 * Get,filter and save proxies
 *
 * @return  {Boolean}  Result
 */
export async function updateProxies() {
    log("Update proxies");

    proxyDb.read();

    // get proxy list
    let proxyList = await getProxyList();

    log(`Found proxies: ${proxyList.length}`);

    proxyList = proxyList.filter((item) => !proxyDb.data.includes(item));

    log(`Proxies after DB filter: ${proxyList.length}`);

    // filter working proxies
    proxyList = await filterProxyList(proxyList, options.timeout / 4);

    log(`Proxies after filter: ${proxyList.length}`);

    for (const url of proxyList) {
        if (!proxyDb.data.includes(url)) {
            proxyDb.data.push(url);
            proxyDb.write();
        }
    }

    return false;
}

export default updateProxies;
