import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from fastapi import HTTPException, status
import logging
import uuid
from typing import List
from datetime import datetime, timedelta, timezone

from core.config import settings
from pydantic import BaseModel

# Pydantic models for service contract
class FileInfo(BaseModel):
    filename: str
    contentType: str
    # Opcional: cuando el cliente necesita un nombre exacto (ej: thumbnails derivados).
    objectName: str | None = None

class PresignedURLData(BaseModel):
    upload_url: str
    object_name: str
    original_filename: str

class StorageService:
    def __init__(self):
        if not all([settings.S3_ENDPOINT_URL, settings.S3_ACCESS_KEY_ID, settings.S3_SECRET_ACCESS_KEY, settings.S3_BUCKET_NAME]):
            raise ValueError("S3 settings are not configured properly.")

        self.s3_client = boto3.client(
            's3',
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version='s3v4')
        )
        self.bucket_name = settings.S3_BUCKET_NAME

        # Ensure the bucket exists, create it if it does not.
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
        except ClientError as e:
            # If a 404 error is raised, the bucket does not exist.
            if e.response['Error']['Code'] == '404':
                logging.info(f"Bucket '{self.bucket_name}' not found. Creating it.")
                self.s3_client.create_bucket(Bucket=self.bucket_name)
                logging.info(f"Bucket '{self.bucket_name}' created successfully.")
            else:
                logging.error("Error checking for bucket:", e)
                raise

    def generate_presigned_put_url(self, object_name: str, content_type: str, expiration: int = 3600) -> str:
        """
        Generate a presigned URL to upload an object to S3.
        """
        try:
            response = self.s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': self.bucket_name,
                    'Key': object_name,
                    'ContentType': content_type
                },
                ExpiresIn=expiration
            )
            # Replace the internal endpoint URL with the public one for browser access.
            # e.g., http://localstack:4566 -> http://localhost:4566
            if settings.ENVIRONMENT == "local" and settings.S3_PUBLIC_URL and settings.S3_ENDPOINT_URL:
                response = response.replace(settings.S3_ENDPOINT_URL, settings.S3_PUBLIC_URL)

            return response
        except ClientError as e:
            logging.error(f"Error generating presigned PUT URL: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not generate upload URL."
            )

    def generate_presigned_get_url(self, object_name: str, expiration: int = 3600) -> str:
        """
        Generate a presigned URL to view an object from S3.
        """
        try:
            response = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expiration
            )
            # Replace the internal endpoint URL with the public one for browser access.
            # e.g., http://localstack:4566 -> http://localhost:4566
            if settings.ENVIRONMENT == "local" and settings.S3_PUBLIC_URL and settings.S3_ENDPOINT_URL:
                response = response.replace(settings.S3_ENDPOINT_URL, settings.S3_PUBLIC_URL)
                
            return response
        except ClientError as e:
            logging.error(f"Error generating presigned GET URL: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not generate view URL."
            )

    def delete_file(self, object_name: str):
        """
        Deletes a file from the S3-compatible storage.
        :param object_name: The key of the object to delete.
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=object_name
            )
            logging.info(f"Successfully deleted {object_name} from bucket {self.bucket_name}")
        except ClientError as e:
            logging.error(f"Error deleting file {object_name} from S3: {e}")
            # Re-raise as a generic HTTPException to avoid leaking too much detail
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Could not delete file from storage."
            )

    def get_bucket_usage(self) -> dict:
        """
        Calculates the total size of all objects in the bucket.
        """
        total_size = 0
        try:
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket_name)
            for page in pages:
                if "Contents" in page:
                    for obj in page['Contents']:
                        total_size += obj['Size']
            
            # Convert size to a more readable format
            if total_size < 1024:
                readable_size = f"{total_size} Bytes"
            elif total_size < 1024**2:
                readable_size = f"{total_size/1024:.2f} KB"
            elif total_size < 1024**3:
                readable_size = f"{total_size/1024**2:.2f} MB"
            else:
                readable_size = f"{total_size/1024**3:.2f} GB"

            return {"total_size_bytes": total_size, "readable_size": readable_size}
        except ClientError as e:
            logging.error(f"Error calculating bucket size: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not calculate bucket size."
            )

    def delete_old_files(self, days_older: int):
        """
        Deletes files older than a specified number of days.
        """
        if days_older <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Number of days must be positive."
            )

        try:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_older)
            objects_to_delete = []
            
            paginator = self.s3_client.get_paginator('list_objects_v2')
            pages = paginator.paginate(Bucket=self.bucket_name)

            for page in pages:
                if "Contents" in page:
                    for obj in page['Contents']:
                        if obj['LastModified'] < cutoff_date:
                            objects_to_delete.append({'Key': obj['Key']})
            
            if not objects_to_delete:
                return {"message": "No files found older than specified date.", "deleted_count": 0}

            # S3 delete_objects can handle up to 1000 keys at a time
            for i in range(0, len(objects_to_delete), 1000):
                chunk = objects_to_delete[i:i + 1000]
                self.s3_client.delete_objects(
                    Bucket=self.bucket_name,
                    Delete={'Objects': chunk}
                )
            
            return {"message": f"Successfully deleted {len(objects_to_delete)} old files.", "deleted_count": len(objects_to_delete)}
        except ClientError as e:
            logging.error(f"Error deleting old files: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Could not delete old files."
            )

    def _sanitize_object_name(self, object_name: str) -> str:
        if ".." in object_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid object name."
            )
        if not object_name.startswith("photos/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Object name must start with 'photos/'."
            )
        return object_name

    def prepare_upload_urls(self, files_info: List[FileInfo]) -> List[PresignedURLData]:
        """
        Prepares a list of presigned PUT URLs for multiple files.
        Generates unique object names and includes content type in the signature.
        """
        response_data = []
        if not files_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File list cannot be empty."
            )

        for file_info in files_info:
            try:
                # Si el cliente provee un objectName (ej: thumbnails), lo respetamos tras sanitizar.
                if file_info.objectName:
                    object_name = self._sanitize_object_name(file_info.objectName)
                else:
                    file_extension = file_info.filename.split('.')[-1] if '.' in file_info.filename else ''
                    unique_id = uuid.uuid4()
                    object_name = f"photos/{unique_id}.{file_extension}" if file_extension else f"photos/{unique_id}"

                upload_url = self.generate_presigned_put_url(
                    object_name=object_name,
                    content_type=file_info.contentType
                )
                
                response_data.append(
                    PresignedURLData(
                        upload_url=upload_url,
                        object_name=object_name,
                        original_filename=file_info.filename
                    )
                )
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to prepare upload URL for {file_info.filename}: {str(e)}"
                )
        return response_data

storage_service = StorageService()

