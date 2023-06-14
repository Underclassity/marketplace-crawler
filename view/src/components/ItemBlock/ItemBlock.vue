<template lang="pug">
.item
    .item-images(v-if="count")
        .item-image(v-for="image of images" :key="image")
            img(:src=`getImageSrc(image)`)
    span ID:{{ itemId }}
    span {{ item.reviews }} reviews
    span Last update {{ new Date(item.time).toLocaleString() }}
</template>

<script src="./ItemBlock.js"></script>
<style src="./ItemBlock.styl" lang="styl"></style>