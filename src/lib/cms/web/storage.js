"use client";

import { Client, Storage } from "appwrite";
import { getCmsConfig } from './config';

let storageInstance = null;

async function getStorage() {
  if (!storageInstance) {
    const config = await getCmsConfig();
    const client = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId);
    
    storageInstance = new Storage(client);
  }
  return storageInstance;
}

export async function getFileDownload(fileId, bucketId) {
  try {
    if (!fileId) return { success: false, message: 'file ID is required' };
    
    const config = await getCmsConfig();
    const storage = await getStorage();
    const response = await storage.getFileDownload(bucketId || config.ticketsBucket, fileId);
    
    return { 
      success: true, 
      data: response 
    };
  } catch (error) {
    console.error('Error getting file download URL:', error);
    return { 
      success: false, 
      message: error.message || 'Failed to get file download URL' 
    };
  }
}