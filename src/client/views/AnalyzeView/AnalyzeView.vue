<template lang="pug">
.main
    .row
        .item(v-if="!isModel") Model loading...
        .item(v-if="isModel") Model loaded

    .row
        .item(v-for="adapter in adapters" :key="adapter.id") {{ adapter.id }} - {{ adapter.items }} items - {{ adapter.files }} files - {{ files[adapter.id] ? Object.keys(files[adapter.id]).length : 0 }} items to analyze

    .row
        img(
            :src="imgSrc"
            v-if="imgSrc"
            ref="image"
            crossorigin="anonymous"
        )
</template>

<script src="./AnalyzeView.js"></script>
<style src="./AnalyzeView.styl" lang="stylus"></style>
