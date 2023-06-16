<template lang="pug">
router-link.item(:to='{ name:"ItemView", params: { itemId: itemId } }')
    .item-images
        .item-image(v-for="image of images" :key="image")
            img(v-lazy=`{ src: getImageSrc(image) }`)
        .item-image(v-if="!count || count < 9" v-for="index in (9 - count)" :key="index")

    .item-info
        span ID:{{ itemId }}
        span {{ item.reviews }} reviews
        span {{ item.files }} files
        span Last update {{ new Date(item.time).toLocaleString() }}
</template>

<script src="./ItemBlock.js"></script>
<style src="./ItemBlock.styl" lang="styl"></style>