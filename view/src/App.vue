<template lang="pug">
nav
    router-link(to="/") Home
    router-link(to="/adapters") Adapters
    span Size {{ size }}
    span Pending {{ pending }}
    span Paused {{  isPaused }}

router-view

OverlayBlock
</template>

<script src="./App.js"></script>
<style src="./App.styl" lang="styl"></style>