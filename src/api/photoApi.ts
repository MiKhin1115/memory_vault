import { CoreApiClient } from "../axios/core-api-client";

type UploadPhotoPayload = {
  guestName?: string;
  message?: string;
  photoId: string;
  base64String: string;
};

export const uploadPhoto = async (
  payload: UploadPhotoPayload,
  accessToken?: string,
) => {
  const result = await CoreApiClient.post("/add_photo", payload, {
    headers: accessToken
      ? {
          "access-token": accessToken,
        }
      : undefined,
  });

  return result.data;
};