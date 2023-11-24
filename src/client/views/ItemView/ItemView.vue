<template lang="pug">
.main
    .info
        h2 {{ adapter }}
        h3 {{ itemId }}
        h3 {{ prettySize }}

    .review(v-for="review in reviews" :key="review.id")
        h3 {{ review.id }}
        .files(v-viewer)
            .file(v-for="file of review.images" :key="file")
                img(v-if="file.indexOf('.mp4') == -1" v-lazy=`{ src: getImageSrc(file) }` :ref="file" crossorigin="anonymous")
                video(v-if="file.indexOf('.mp4') != -1" :src="getVideoSrc(file)" controls autostart="false" :ref="file" crossorigin="anonymous")
                button(v-on:click="analyze(file)") Analyze
</template>

<script src="./ItemView.js"></script>
<style src="./ItemView.styl" lang="styl"></style>