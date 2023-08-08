# Marketplace crawler

Crawl reviews from different sites, save and convert images and videos. Detect images and videos with classification.

Supported sites:
- [aliexpress.com](https://aliexpress.com)
- [amazon.com](https://amazon.com)
- [decathlon.com](https://decathlon.com)
- [ebay.com](https://ebay.com)
- [joom.com](https://joom.com)
- [kufar.by](https://kufar.by)
- [onliner.by](https://onliner.by)
- [ozon.ru](https://ozon.ru)
- [wildberries.ru](https://wildberries.ru)

***

Command line params:
- `directory` - directory where run script
- `query` - query to add items
- `brand` - get items by brand
- `brands` - update all items with brands
- `tags` - get all items with saved queries
- `favorite` - update only favorites items
- `proxy` - user proxy flag
- `download` - download items flag
- `thumbnail` - generate thumbnails flag
- `image` - download images flag
- `video` - download video flag
- `update` - update items flag
- `reviews` - update reviews flag
- `throat` - concurrency for queue
- `pages` - pages to get
- `start` - start page
- `timeout` - timeout number for different requests
- `force` - force update flag
- `headless` - headless browser run flag
- `cookies` - run browser to save and update cookies
- `time` - time diff to update in hours
- `logs` - show logs flag
- `id` - get by id
- `include` - include adapters
- `exclude` - exclude adapter
- `pageSize` - page size for different request

***

Usage examples:
- `node index.js --throat 3 --timeout 10000 --include wildberries --update true`
- `node index.js --throat 5 --include aliexpress --download false`
- `node index.js --throat 2 --include kufar --query "wetsuit"`

***

System dependencies:
- `ffmpeg` - cut video to frames
- `cwebp` - convert images to webp file format
- `yt-dlp` - download m3u8 video files