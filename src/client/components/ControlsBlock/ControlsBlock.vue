<template lang="pug">
.controls(v-if="items?.length")
    span.button(@click.prevent.stop="deleteItems") Delete items
</template>

<script src="./ControlsBlock.js"></script>
<style src="./ControlsBlock.styl" lang="styl" scoped></style>