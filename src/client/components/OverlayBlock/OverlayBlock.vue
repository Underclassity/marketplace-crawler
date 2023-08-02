<template lang="pug">
.overlay(
    v-bind:class="{ 'overlay--hidden': !isVisible }"
)
    .overlay--spinner
        .overlay--spinner--icon
            img(src="../../assets/spinners/180-ring-with-bg.svg")
</template>

<script src="./OverlayBlock.js"></script>
<style src="./OverlayBlock.styl" lang="styl"></style>