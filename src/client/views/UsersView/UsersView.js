import axios from "axios";

export default {
    name: "UsersView",

    data() {
        return {
            users: {},
        };
    },

    async mounted() {
        try {
            const request = await axios("http://localhost:3000/users");

            const { users } = request.data;

            this.users = users;
        } catch (error) {
            console.log(error.message);
        }
    },
};
