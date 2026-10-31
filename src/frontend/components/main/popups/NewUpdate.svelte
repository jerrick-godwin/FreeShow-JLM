<script lang="ts">
    import { activePopup } from "../../../stores"
    import MaterialButton from "../../inputs/MaterialButton.svelte"
</script>

<p>Contact your ministry administrator for the latest Jesus Lives Ministry installer.</p>
<MaterialButton on:click={() => activePopup.set(null)}>Close</MaterialButton>
