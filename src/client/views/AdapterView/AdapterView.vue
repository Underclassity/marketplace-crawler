<template lang="pug">
.main
    .title Adapter - {{ adapter }} - {{ count }} items
    .filters
        .filter-item
            input(type="checkbox" id="photos" v-model="isPhotos" v-on:change="changeFilter")
            label(for="photos") With photos

        .filter-item
            input(type="checkbox" id="favorite" v-model="isFavorite" v-on:change="changeFilter")
            label(for="favorite") Favorites

        .filter-item
            label(for="limit-select") Items per page
            select(v-model="limit" v-on:change="changeFilter" id="limit-select")
                option(value=12) 12
                option(value=24) 24
                option(value=48) 48
                option(value=100) 100

        .filter-item
            label(for="sort-select") Sort items
            select(v-model="sortId" id="sort-select" v-on:change="changeFilter")
                option(value=false) None
                option(value="reviewsAsc") Reviews ASC
                option(value="reviewsDesc") Reviews DESC
                option(value="filesAsc") Files ASC
                option(value="filesDesc") Files DESC
                option(value="sizeAsc") Size ASC
                option(value="sizeDesc") Size DESC

        .filter-item(v-if="brands && Object.keys(brands).length")
            label(for="brand-select") Brands
            select(v-model="brand" id="brand-select" v-on:change="changeFilter")
                option(value="") None
                option(value="no-brand") No brand
                option(v-for="brand in brands" :key="brand.id" :value="brand.id") {{ brand.name || brand.id }}

        .filter-item(v-if="tags?.length")
            label(for="brand-select") Tags
            select(v-model="tag" id="brand-select" v-on:change="changeFilter")
                option(value="") None
                option(value="no-tag") No tag
                option(v-for="tag of tags" :key="tag" :value="tag") {{ tag }}

        .filter-item(v-if="Object.keys(predictions).length")
            label(for="predictions-select") Predictions
            select(v-model="prediction" id="predictions-select" v-on:change="changeFilter")
                option(value="") None
                option(value="no-prediction") No prediction
                option(v-for="(prediction, id) in predictions" :key="id" :value="id") {{ id }} ({{ prediction.min.toFixed(2) }}-{{ prediction.avg.toFixed(2) }}-{{ prediction.max.toFixed(2) }})

        .filter-item
            button(v-on:click.prevent.stop="updateAllOnPage") Update all on page

    .items(v-if="items?.length")
        ItemBlock(v-for="item of items" :key="item.id" :item="item" :itemId="item.id" :adapter="adapter")

    h1(v-if="!items?.length") No items found

    PaginationBlock(:count="count")

    ControlsBlock(:items="itemsForDelete" :adapter="adapter" :changeRoute="changeRoute")
</template>

<script src="./AdapterView.js"></script>
<style src="./AdapterView.styl" lang="styl"></style>
