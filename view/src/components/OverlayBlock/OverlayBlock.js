export default {
  name: "OverlayBlock",

  data() {
    return {
      isVisible: false,
    };
  },

  methods: {
    triggerSpinner(state) {
      if (state != undefined) {
        this.isVisible = state;
        return this.isVisible;
      }

      this.isVisible = !this.isVisible;

      this.$store.state.isSpinner = this.isVisible;

      return this.isVisible;
    },
  },

  mounted() {
    this.emitter.on("triggerSpinner", this.triggerSpinner);
  },

  beforeUnmount() {
    this.emitter.off("triggerSpinner", this.triggerSpinner);
  },
};
