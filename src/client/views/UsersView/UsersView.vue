<template lang="pug">
.main
    .adapters-list
        router-link(v-for="(value, adapter) in users" :key="adapter" :to="{ name: 'UsersView', params: { id: adapter } }") {{ adapter }} {{ value }} users
</template>

<script src="./UsersView.js"></script>
<style src="./UsersView.styl" lang="stylus"></style>