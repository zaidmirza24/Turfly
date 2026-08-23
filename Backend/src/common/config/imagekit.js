import ImageKit from "imagekit";
import env from "./env.js";

/**
 * Master image storage + delivery CDN.
 *
 * Uploads keep their original quality here (see image.service.js) and every
 * consumer asks for a *transformed* variant (card/gallery/full) at request
 * time via image.controller.js — nothing permanently downsamples the master,
 * so a listing can be re-cropped or re-encoded later without re-uploading.
 */
const imagekit = env.IMAGEKIT_PUBLIC_KEY
  ? new ImageKit({
      publicKey: env.IMAGEKIT_PUBLIC_KEY,
      privateKey: env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
    })
  : null;

export default imagekit;
