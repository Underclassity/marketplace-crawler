import options from "../options.js";

/**
 * Priorities by type for queue
 *
 * @var {Object}
 */
export const priorities = options.reviews
    ? {
          page: 1,
          item: 2,
          review: 3,
          checkSize: 4,
          download: 5,
          cut: 6,
          thumbnail: 7,
      }
    : {
          page: 7,
          item: 6,
          review: 5,
          checkSize: 4,
          download: 3,
          cut: 2,
          thumbnail: 1,
      };

export default priorities;
