# Catalog images

`garments`, `handwear`, and `headwear` store the image to display directly in
`item_image_url`. Use an HTTPS image URL or a root-relative path to a file in
`public/`. Set it to `NULL` when no image is available. Brand/model names are not
used to resolve photos, so renaming an item does not change its image.

Catalog and wardrobe API responses include this field. Both the thumbnail and
detail view load it directly, with native lazy loading. Missing or failed images
show an inline category icon, which needs no additional network request. Brand
logo handling is unchanged.

Apply `20261026201302_direct_catalog_image_urls.sql`, followed by
`20261027001728_restore_current_catalog_photos.sql`, before deploying the removal
of `/api/media/item-image`. The first migration transfers the old product mapping
into catalog rows and uses direct silhouette paths for other legacy rows. The
follow-up restores six photos present on main that were absent from the original
implementation checkout, while preserving subsequent explicit photo edits.
The trigger no longer fills empty image fields with lookup URLs. The client
ignores legacy URLs in cached responses and shows its local fallback.

To replace a photo, update its catalog row's `item_image_url`. Check that the URL
returns an image; if it refers to `/public` assets, deploy the file before changing
the database reference. Hosted images can be updated without an app deployment.
