<template lang="pug">
.main
    .info
        h2 {{ adapter }}
        h3 {{ itemId }}
        h3 {{ prettySize }}

    .files(v-viewer)
        .file(v-for="file of files" :key="file")
            img(v-if="file.indexOf('.mp4') == -1" v-lazy=`{ src: getImageSrc(file) }`)
            video(v-if="file.indexOf('.mp4') != -1" :src="getVideoSrc(file)" controls autostart="false")
</template>

<script src="./ItemView.js"></script>
<style src="./ItemView.styl" lang="styl"></style>