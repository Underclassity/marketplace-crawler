<template lang="pug">
.main
    .info
        span {{ adapter }}
        span {{ itemId }}

    .files
        img(v-for="file of files" :key="file" v-lazy=`{ src: getImageSrc(file) }`)
</template>

<script src="./ItemView.js"></script>
<style src="./ItemView.styl" lang="styl"></style>