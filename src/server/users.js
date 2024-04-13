import express from "express";

import { getUsers, getUser, getUserReviews } from "../helpers/db.js";
import getAdaptersIds from "../helpers/get-adapters-ids.js";

const adapters = getAdaptersIds();

export const usersRouter = express.Router();

/**
 * Get users data for every adapter
 *
 * @param   {Object}  req  Request object
 * @param   {Object}  res  Response object
 *
 * @return  {Object}       Response object
 */
usersRouter.get("/", async (req, res) => {
    const users = {};

    for (const adapter of adapters) {
        users[adapter] = Object.keys(await getUsers(adapter)).length;
    }

    return res.json({
        users,
        error: false,
    });
});

/**
 * Get users data for adapter
 *
 * @param   {Object}  req  Request object
 * @param   {Object}  res  Response object
 *
 * @return  {Object}       Response object
 */
usersRouter.get("/:adapter", async (req, res) => {
    const { adapter } = req.params;

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 100, 10);
    const isPhotos = req.query.photos == "true" || false;
    // const isFavoriteFlag = req.query.favorite == "true" || false;
    // const sortId = req.query.sort || false;

    if (!adapters.includes(adapter)) {
        return res.json({
            result: false,
            error: `${adapter} not found in adapters`,
        });
    }

    let users = await getUsers(adapter);
    const count = Object.keys(users).length;

    const filteredUsers = [];

    for (const userId of Object.keys(users)) {
        if (!("photos" in req.query)) {
            continue;
        }

        let userReviews = await getUserReviews(adapter, userId);

        userReviews = isPhotos
            ? userReviews.filter((item) => item?.photos?.length)
            : userReviews.filter((item) => !item?.photos?.length);

        if (userReviews.length) {
            filteredUsers.push(userId);
        }
    }

    users = [...filteredUsers];

    users = users
        .slice((page - 1) * limit, (page - 1) * limit + limit)
        .map((userId) => {
            return {
                id: userId,
                reviews: users[userId].length,
                info: getUser(adapter, userId),
            };
        });

    return res.json({
        users,
        count,
        error: false,
    });
});

export default usersRouter;
