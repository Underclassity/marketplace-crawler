<template lang="pug">
nav
    router-link(to="/") Home
    router-link(to="/adapters") Adapters

router-view

OverlayBlock
</template>

<script src="./App.js"></script>
<style src="./App.styl" lang="styl"></style>