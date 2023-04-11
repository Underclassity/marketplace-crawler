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
      }
    : {
          page: 5,
          item: 4,
          review: 3,
          checkSize: 2,
          download: 1,
      };

export default priorities;
