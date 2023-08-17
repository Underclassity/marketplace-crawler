<template lang="pug">
.status
    .status-item Size {{ size }}
    .status-item Pending {{ pending }}
    .status-item Paused {{  isPaused }}

    .status-item(v-for="(priority, id) in priorities" :key="id") {{ id }} {{ values[id] }}
</template>

<script src="./QueueStatus.js"></script>
<style src="./QueueStatus.styl" lang="styl"></style>