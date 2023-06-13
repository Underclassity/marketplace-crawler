<template lang="pug">
.title Adapter - {{ adapter }} - {{ count }} items
.filters
    input.filter-item(type="checkbox" id="photos" v-model="isPhotos" v-on:change="getItems")
    label(for="photos") With photos
.items(v-if="items")
    .item(v-for="(item, itemId) in items" :key="itemId") ID:{{ itemId }} - {{ item.reviews }} reviews

PaginationBlock(:count="count")
</template>

<script src="./AdapterView.js"></script>
<style src="./AdapterView.styl" lang="styl"></style>