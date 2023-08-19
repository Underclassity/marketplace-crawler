import fs from "node:fs";
import path from "node:path";

import axios from "axios";

import {
    addItem,
    addReview,
    dbWrite,
    getBrands,
    getItem,
    getItems,
    getReview,
    getTags,
    updateBrand,
    updateItem,
    updateTags,
    updateTime,
} from "../helpers/db.js";

import downloadItem from "../helpers/image-process.js";
import getHeaders from "../helpers/get-headers.js";
import logMsg from "../helpers/log-msg.js";
import options from "../options.js";
import priorities from "../helpers/priorities.js";

const prefix = "";

/**
 * Log helper
 *
 * @param   {String}  msg             Message
 * @param   {String}  [itemId=false]  Item ID
 *
 * @return  {Boolean}                 Result
 */
function log(msg, itemId = false) {
    return logMsg(msg, itemId, prefix);
}

/**
 * Log message helper
 *
 * @param   {String}  msg      Message
 * @param   {String}  itemI    Item ID
 *
 * @return  {Boolean}          Result
 */
function log(msg, itemId = false) {
    return logMsg(msg, itemId, prefix);
}

/**
 * Update items with brands helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export async function updateBrands(queue) {}

/**
 * Update items with tags
 *
 * @param   {Object}  queue  Queue instance
 *
 * @return  {Boolean}        Result
 */
export async function updateWithTags(queue) {}

/**
 * Update item by ID
 *
 * @param   {String}  itemId  Item ID
 * @param   {Object}  queue   Queue instance
 *
 * @return  {Boolean}         Result
 */
export async function updateItemById(itemId, queue) {}

/**
 * Update items helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateItems(queue) {}

/**
 * Update reviews helper
 *
 * @param   {Object}  queue  Queue
 *
 * @return  {Boolean}        Result
 */
export function updateReviews(queue) {}

/**
 * Get brand items by brand ID
 *
 * @param   {String}  brandID  Brand ID
 * @param   {Object}  queue    Queue instance
 *
 * @return  {Array}            Brand IDs array
 */
export async function getBrandItemsByID(brandID, queue) {}

/**
 * Get items by brand
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  brand  Brand ID
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByBrand(queue, brand = options.brand) {}

/**
 * Get items by query
 *
 * @param   {Object}  queue  Queue
 * @param   {String}  query  Query
 *
 * @return  {Boolean}        Result
 */
export async function getItemsByQuery(queue, query = options.query) {}

export default getItemsByQuery;
