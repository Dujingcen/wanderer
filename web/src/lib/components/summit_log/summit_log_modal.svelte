<script lang="ts">
    import { createEventDispatcher } from "svelte";

    import {
        SummitLogCreateSchema,
    } from "$lib/models/api/summit_log_schema";
    import GPX from "$lib/models/gpx/gpx";
    import { summitLog } from "$lib/stores/summit_log_store";
    import { createForm } from "felte";
    import { validator } from "@felte/validator-zod";
    import { _ } from "svelte-i18n";
    import { z } from "zod";
    import Datepicker from "../base/datepicker.svelte";
    import Modal from "../base/modal.svelte";
    import Textarea from "../base/textarea.svelte";
    import PhotoPicker from "../trail/photo_picker.svelte";
    import TrailPicker from "../trail/trail_picker.svelte";
    import { cloneDeep } from "$lib/util/deep_util";
    export let openModal: (() => void) | undefined = undefined;
    export let closeModal: (() => void) | undefined = undefined;

    const dispatch = createEventDispatcher();

    const ClientSummitLogCreateSchema = SummitLogCreateSchema.extend({
        _photos: z.array(z.instanceof(File)).optional(),
        _gpx: z.instanceof(File).optional().nullable(),
        expand: z
            .object({
                gpx_data: z.string().optional(),
            })
            .optional(),
    });

    const { form, errors, data, setFields } = createForm<
        z.infer<typeof ClientSummitLogCreateSchema>
    >({
        initialValues: $summitLog,
        extend: validator({ schema: ClientSummitLogCreateSchema }),
        onSubmit: async (form) => {           
            if (!form.expand?.gpx_data) {
                form.gpx = "";
            }

            if (
                !form._photos?.length &&
                !form.photos?.length &&
                form.expand?.gpx_data
            ) {
                const canvas = document.querySelector(
                    "#trail-picker-map .maplibregl-canvas",
                ) as HTMLCanvasElement;

                const dataURL = canvas.toDataURL();
                const response = await fetch(dataURL);
                const blob = await response.blob();
                form._photos = [new File([blob], "route")];
            }

            dispatch("save", form);
            closeModal!();
        },
    });
    $: setFields(cloneDeep($summitLog));

    $: if ($summitLog._gpx) {
        $data._gpx = $summitLog._gpx;
    }

    async function handleTrailSelection(trailData: string | null) {
        if (!trailData) {
            $data.duration = undefined;
            $data.elevation_gain = undefined;
            $data.elevation_loss = undefined;
            $data.distance = undefined;
            return;
        }
        const gpxObject = await GPX.parse(trailData);
        if (gpxObject instanceof Error) {
            throw gpxObject;
        }

        const totals = gpxObject.getTotals();

        $data.duration = totals.duration / 1000;
        $data.elevation_gain = totals.elevationGain;
        $data.elevation_loss = totals.elevationLoss;
        $data.distance = totals.distance;
    }
</script>
<Modal
    id="summit-log-modal"
    title={$data.id ? $_("edit-entry") : $_("add-entry")}
    let:openModal
    bind:openModal
    bind:closeModal
>
    <slot {openModal} />
    <form
        id="summit-log-form"
        slot="content"
        class="modal-content space-y-4"
        use:form
    >
        <div class="flex">
            <Datepicker name="date" label={$_("date")} error={$errors.date}
            ></Datepicker>
        </div>
        <div>
            <label for="summitlog-photo-input" class="text-sm font-medium pb-1">
                {$_("photos")}
            </label>
            <PhotoPicker
                id="summitlog-photo-input"
                parent={$data}
                bind:photos={$data.photos}
                bind:photoFiles={$data._photos}
                showThumbnailControls={false}
            ></PhotoPicker>
        </div>
        <div class="flex gap-4">
            {#if $data.expand}
                <TrailPicker
                    bind:trailFile={$data._gpx}
                    bind:trailData={$data.expand.gpx_data}
                    label={$_("trail", { values: { n: 1 } })}
                    on:change={(e) => handleTrailSelection(e.detail)}
                ></TrailPicker>
            {/if}
            <div class="basis-full">
                <Textarea
                    name="text"
                    extraClasses="h-28"
                    label={$_("text")}
                    error={$errors.text}
                ></Textarea>
            </div>
        </div>
    </form>
    <div slot="footer" class="flex items-center gap-4">
        <button class="btn-secondary" on:click={closeModal}
            >{$_("cancel")}</button
        >
        <button class="btn-primary" type="submit" form="summit-log-form"
            >{$_("save")}</button
        >
    </div>
</Modal>
