<template lang="pug">
.main
    .adapters-list
        router-link(v-for="adapter of adapters" :key="adapter" :to="{ name: 'AdapterView', params: { id: adapter } }") {{ adapter }}
</template>

<script src="./AdaptersView.js"></script>
<style src="./AdaptersView.styl" lang="styl"></style>