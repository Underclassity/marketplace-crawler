import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import axios from "axios";
import pAll from "p-all";

import { LowSync } from "lowdb";
import { JSONFileSync } from "lowdb/node";

import log from "./log.js";
import options from "../options.js";

const dbPath = path.resolve(options.directory, "db");

if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath);
}

const proxyAdapter = new JSONFileSync(path.resolve(dbPath, "proxy.json"));
const proxyDb = new LowSync(proxyAdapter, {});

proxyDb.read();

if (!proxyDb.data) {
    proxyDb.data = [];
    proxyDb.write();
}

// URLs to raw proxy list data from Github or other sources
const proxyURLs = [
    "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
    "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
    "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies.txt",
];

/**
 * Get random proxy config
 *
 * @param   {Boolean}  [force=false]  Force get flag
 *
 * @return  {Object}                  Proxy settings
 */
export function getProxy(force = false) {
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
        url: randomProxy,
        protocol: "http",
        host,
        port,
    };
}

/**
 * Get proxy list from repo
 *
 * @param   {String}  url  URL for download proxy list
 *
 * @return  {Array}        Proxies array list
 */
export async function getProxyList(url) {
    if (!url || !url.length) {
        return false;
    }

    let proxies = [];

    if (!url) {
        return proxies;
    }

    try {
        const fileRequest = await axios(url, {
            responseType: "text",
        });

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
 * @param   {Array}   data          Input proxies array
 * @param   {Number}  [delay=500]   Delay between tests
 *
 * @return  {Array}                 Filtered proxies array
 */
export async function filterProxyList(data, delay = 500) {
    if (!data) {
        data = await getProxyList();
    }

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
    let proxyList = [];

    for (const proxyURL of proxyURLs) {
        proxyList.push(...(await getProxyList(proxyURL)));
    }

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
