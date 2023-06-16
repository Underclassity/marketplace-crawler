<template lang="pug">
.main
    .title Adapter - {{ adapter }} - {{ count }} items
    .filters
        .filter-item
            input(type="checkbox" id="photos" v-model="isPhotos" v-on:change="changeRoute")
            label(for="photos") With photos

        .filter-item
            label(for="limit-select") Items per page
            select(v-model="limit" v-on:change="changeRoute" id="limit-select")
                option(value=10) 10
                option(value=20) 20
                option(value=50) 50
                option(value=100) 100

        .filter-item
            label(for="sort-select") Sort items
            select(v-model="sortId" id="sort-select" v-on:change="changeRoute")
                option(value=false) None
                option(value="reviewsAsc") Reviews ASC
                option(value="reviewsDesc") Reviews DESC
                option(value="filesAsc") Files ASC
                option(value="filesDesc") Files DESC

    .items(v-if="items")
        ItemBlock(v-for="(item, itemId) in items" :key="itemId" :item="item" :itemId="itemId" :adapter="adapter")

    PaginationBlock(:count="count")
</template>

<script src="./AdapterView.js"></script>
<style src="./AdapterView.styl" lang="styl"></style>