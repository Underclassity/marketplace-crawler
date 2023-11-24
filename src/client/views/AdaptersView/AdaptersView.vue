<template lang="pug">
.main
    .adapters-list
        router-link(v-for="adapter of adapters" :key="adapter.id" :to="{ name: 'AdapterView', params: { id: adapter.id } }") {{ adapter.id }} ({{ adapter.items }} items, {{ adapter.files }} files, {{ adapter.reviews }} reviews)
</template>

<script src="./AdaptersView.js"></script>
<style src="./AdaptersView.styl" lang="styl"></style>