<template lang="pug">
.item
    .item-images(:class="getImageClassname()")
        .item-image(v-for="image of images" :key="image")
            img(v-lazy=`{ src: getImageSrc(image) }`)
        .item-image(v-if="emptyImagesCount" v-for="index in emptyImagesCount" :key="index")
            span.material-symbols-outlined no_photography

        .item-like.green(v-on:click="addToFavorite" v-if="!isFavorite")
            span.material-symbols-outlined heart_plus

        .item-like.red(v-on:click="removeFromFavorite" v-if="isFavorite")
            span.material-symbols-outlined heart_minus

        .item-checkbox
            label(:for="`delete-${itemId}`") Delete
            input(type="checkbox" :id="`delete-${itemId}`" @change.prevent.stop="updateDeleteItems(itemId)")

        .item-update(v-on:click="updateItem" v-if="!isUpdating") Update
        .item-update(v-on:click="updateItem" v-if="isUpdating")
            span Updating
            img(src="../../assets/spinners/180-ring-with-bg.svg")

    .item-info
        router-link.span(:to='{ name:"ItemView", params: { itemId: itemId } }') ID: {{ itemId }}
        span.link(v-on:click="goToBrand") Brand: {{ brandName ? brandName : "None" }}
        span {{ category }}
        span {{ item.reviews }} reviews
        span {{ item.files || 0 }} files
        span Tags: {{ item.tags?.length ? item.tags.join(', ') : "None" }}
        span {{ pretty(item.size) }} size
        span(:class="getTimeClass()") Last update {{ new Date(item.time).toLocaleString() }}
</template>

<script src="./ItemBlock.js"></script>
<style src="./ItemBlock.styl" lang="styl"></style>