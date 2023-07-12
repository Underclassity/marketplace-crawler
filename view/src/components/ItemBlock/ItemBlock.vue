<template lang="pug">
.item
    .item-images
        .item-image(v-for="image of images" :key="image")
            img(v-lazy=`{ src: getImageSrc(image) }`)
        .item-image(v-if="!count || count < 9" v-for="index in (9 - count)" :key="index")
            span.material-symbols-outlined no_photography

        .item-checkbox
            label(:for="`delete-${itemId}`") Delete
            input(type="checkbox" :id="`delete-${itemId}`" @change.prevent.stop="updateDeleteItems(itemId)")

    .item-info
        router-link.span(:to='{ name:"ItemView", params: { itemId: itemId } }') ID: {{ itemId }}
        span Brand: {{ item.brand || "none" }}
        span {{ item.reviews }} reviews
        span {{ item.files || 0 }} files
        span {{ pretty(item.size) }} size
        span Last update {{ new Date(item.time).toLocaleString() }}
</template>

<script src="./ItemBlock.js"></script>
<style src="./ItemBlock.styl" lang="styl"></style>