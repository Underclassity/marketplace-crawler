<template lang="pug">
//- .pagination(v-if="min === max")
//-     .pagination--page.pagination--page--active {{ min }}

.pagination(v-if="max !== min")
    .pagination--button.pagination--button--prev(
        v-if="!isStart"
        v-on:click="prevCall"
    ) &lt;
    .pagination--page.pagination--page--min(
        v-bind:class="{ 'pagination--page--active': page === min }"
        v-on:click="goToStart"
    ) {{ min }}
    .pagination--page(
        v-if="page === min && (max - min) > 1"
        v-on:click="changePage"
    ) {{ min + 1 }}
    .pagination--divider(v-if="(page - min) > 2") ...

    .pagination--page(
        v-if="filterArray.length"
        v-for="index in filterArray"
        v-bind:class="{ 'pagination--page--active': page === (index + page) }"
        :key="index + page"
        v-on:click="changePage"
    ) {{ index + page }}

    //- .pagination--page 8
    //- .pagination--page(v-bind:class="{ 'pagination--page--active': page === 9 }") 9
    //- .pagination--page 10

    .pagination--divider(v-if="(max - page) > 2") ...
    .pagination--page(
        v-if="page === max && (max - min) > 1"
        v-on:click="changePage"
    ) {{ max - 1 }}
    .pagination--page.pagination--page--max(
        v-bind:class="{ 'pagination--page--active': page === max }"
        v-on:click="goToEnd"
    ) {{ max }}
    .pagination--button.pagination--button--next(
        v-if="!isEnd"
        v-on:click="nextCall"
    ) &gt;
</template>

<script src="./PaginationBlock.js"></script>
<style src="./PaginationBlock.styl" lang="styl"></style>