const taskModel = require('../models/taskModel');
const { validateTaskPayload } = require('../validators/taskValidator');
const cloudinaryService = require('./cloudinaryService');
const { sendTaskCreatedEmail } = require('./emailService');

function validatePayload(payload) {
  const validation = validateTaskPayload(payload);
  if (!validation.valid) {
    const error = new Error('Task payload is invalid.');
    error.code = 'VALIDATION_ERROR';
    error.details = validation.errors;
    throw error;
  }

  return validation.value;
}

function createNotFoundError() {
  const error = new Error('Task not found.');
  error.code = 'TASK_NOT_FOUND';
  return error;
}

function createCleanupError() {
  const error = new Error('Task image cleanup failed.');
  error.code = 'CLOUDINARY_CLEANUP_FAILED';
  return error;
}

async function cleanupUploadedImage(image) {
  if (!image) {
    return;
  }

  try {
    await cloudinaryService.deleteImage(image.publicId);
  } catch {
    throw createCleanupError();
  }
}

async function uploadPayloadImage(taskValues, imageFile) {
  if (imageFile && taskValues.image_url) {
    const error = new Error('Provide either an uploaded image or image_url, not both.');
    error.code = 'VALIDATION_ERROR';
    error.details = ['Provide either an uploaded image or image_url, not both.'];
    throw error;
  }

  if (imageFile) {
    return cloudinaryService.uploadImage(imageFile);
  }

  if (taskValues.image_url) {
    return cloudinaryService.uploadImage(taskValues.image_url);
  }

  return null;
}

async function createTask(authenticatedUserId, payload, imageFile = null) {
  const taskValues = validatePayload(payload);
  const uploadedImage = await uploadPayloadImage(taskValues, imageFile);

  let task;
  try {
    task = await taskModel.createTask({
      owner_id: authenticatedUserId,
      ...taskValues,
      image_url: uploadedImage ? uploadedImage.secureUrl : null,
      image_public_id: uploadedImage ? uploadedImage.publicId : null
    });
  } catch (error) {
    await cleanupUploadedImage(uploadedImage);
    throw error;
  }

  try {
    const email = await taskModel.getOwnerEmail(authenticatedUserId);
    if (!email) {
      throw new Error('Task owner email address was not found.');
    }

    await sendTaskCreatedEmail({ email, ...task });
  } catch (error) {
    console.error('Task-created email could not be sent:', error.message);
  }

  return task;
}

async function listTasks(authenticatedUserId) {
  return taskModel.getTasksByOwner(authenticatedUserId);
}

async function getTask(authenticatedUserId, taskId) {
  const task = await taskModel.getTaskById(taskId, authenticatedUserId);
  if (!task) {
    throw createNotFoundError();
  }

  return task;
}

async function updateTask(authenticatedUserId, taskId, payload, imageFile = null) {
  const taskValues = validatePayload(payload);
  const existingTask = await taskModel.getTaskForOwner(taskId, authenticatedUserId);
  if (!existingTask) {
    throw createNotFoundError();
  }

  const uploadedImage = await uploadPayloadImage(taskValues, imageFile);
  let task;
  try {
    task = await taskModel.updateTask(taskId, authenticatedUserId, {
      ...taskValues,
      image_url: uploadedImage ? uploadedImage.secureUrl : null,
      image_public_id: uploadedImage ? uploadedImage.publicId : null
    });
  } catch (error) {
    await cleanupUploadedImage(uploadedImage);
    throw error;
  }

  if (!task) {
    await cleanupUploadedImage(uploadedImage);
    throw createNotFoundError();
  }

  if (existingTask.image_public_id && existingTask.image_public_id !== (uploadedImage && uploadedImage.publicId)) {
    await cloudinaryService.deleteImage(existingTask.image_public_id);
  }

  return task;
}

async function deleteTask(authenticatedUserId, taskId) {
  const task = await taskModel.getTaskForOwner(taskId, authenticatedUserId);
  if (!task) {
    throw createNotFoundError();
  }

  if (task.image_public_id) {
    await cloudinaryService.deleteImage(task.image_public_id);
  }

  const deleted = await taskModel.deleteTask(taskId, authenticatedUserId);
  if (!deleted) {
    throw createNotFoundError();
  }

  return { deleted: true };
}

module.exports = {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask
};
