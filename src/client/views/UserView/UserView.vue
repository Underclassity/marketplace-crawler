<template lang="pug">
.main
    .filters
        .filter-item
            input(type="checkbox" id="photos" v-model="isPhotos" v-on:change="changeFilter")
            label(for="photos") With photos

        .filter-item
            input(type="checkbox" id="favorite" v-model="isFavorite" v-on:change="changeFilter")
            label(for="favorite") Favorites

    .users
        .users-item(v-for="user of users")
            .users-item--name(v-show="user.info") {{ user.info.name || "Anonymous" }} - {{ user.info.country }}
            .users-item--id ID: {{ user.id }}
            .users-item--reviews Reviews: {{ user.reviews }}
            .users-item--photo(v-show="user.info") Photo: {{ user.info.hasPhoto }}

    PaginationBlock(:count="count" :inputLimit="limit")
</template>

<script src="./UserView.js"></script>
<style src="./UserView.styl" lang="stylus"></style>