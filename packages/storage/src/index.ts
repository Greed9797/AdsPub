import {
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream } from 'node:fs';
import { loadServerEnv } from '@adpub/config';

export interface StorageOptions {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

export class Storage {
  private readonly client: S3Client;

  constructor(private readonly options: StorageOptions) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
      forcePathStyle: true,
    });
  }

  get bucket(): string {
    return this.options.bucket;
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.options.bucket }));
    }
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /**
   * Sobe um arquivo em disco **sem** carregá-lo na memória: o SDK lê em partes
   * (padrão 5 MB) e faz upload multipart. É o caminho de vídeo (até 500 MB).
   */
  async putFile(key: string, filePath: string, contentType: string): Promise<string> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.options.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
      },
    });
    await upload.done();
    return key;
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Objeto ${key} vazio ou inexistente.`);
    return bytes;
  }

  /**
   * Lê um pedaço do objeto (inclusive nas duas pontas). O upload de vídeo na
   * Meta é em partes de alguns MB, então o worker nunca carrega o arquivo todo.
   */
  async getRange(key: string, start: number, end: number): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Objeto ${key} sem bytes no intervalo ${start}-${end}.`);
    return bytes;
  }

  async presignGet(key: string, ttlSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

let cached: Storage | undefined;

export function getStorage(): Storage {
  if (!cached) {
    const env = loadServerEnv();
    cached = new Storage({
      endpoint: env.S3_ENDPOINT,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
    });
  }
  return cached;
}

export function assetKey(clientId: string, sha256: string, filename: string): string {
  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '';
  return `clients/${clientId}/assets/${sha256}${ext.toLowerCase()}`;
}

export function thumbnailKey(clientId: string, sha256: string): string {
  return `clients/${clientId}/thumbs/${sha256}.jpg`;
}
