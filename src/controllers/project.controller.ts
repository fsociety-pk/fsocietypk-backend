import { Request, Response } from 'express';
import { Project } from '../models/Project';
import mongoose from 'mongoose';
import { z } from 'zod';
import { sendSubmissionEmail } from '../utils/emailHelper';

const httpUrlOrEmpty = z.string().max(2048).refine((value) => {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'URL must use HTTP or HTTPS');

const projectSchema = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(10000),
  techStack: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  websiteUrl: httpUrlOrEmpty.optional(),
  sourceCodeUrl: httpUrlOrEmpty.optional(),
  features: z.array(z.string().trim().min(1).max(300)).max(50).optional(),
}).strict();

const projectUpdateSchema = projectSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one project field is required');

export const getProjects = async (_req: Request, res: Response) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      data: projects,
      message: projects.length ? 'Projects retrieved successfully' : 'No projects found',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve projects',
    });
  }
};

export const getProjectById = async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid project ID',
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Project not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: project,
      message: 'Project retrieved successfully',
    });
  } catch (_error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to retrieve project',
    });
  }
};

export const createProject = async (req: Request, res: Response) => {
  try {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid project data', errors: parsed.error.issues });
    }

    const project = await Project.create(parsed.data);
    await sendSubmissionEmail({
      contentType: 'project',
      title: project.title,
      submitterId: req.user!._id,
    });
    return res.status(201).json({
      success: true,
      data: project,
      message: 'Project created successfully',
    });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Validation error while creating project',
      });
    }
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to create project',
    });
  }
};

export const updateProject = async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid project ID',
      });
    }

    const parsed = projectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, message: 'Invalid project data', errors: parsed.error.issues });
    }

    const updatedProject = await Project.findByIdAndUpdate(req.params.id, parsed.data, {
      new: true,
      runValidators: true,
    });

    if (!updatedProject) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Project not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: updatedProject,
      message: 'Project updated successfully',
    });
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Validation error while updating project',
      });
    }

    return res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to update project',
    });
  }
};

export const deleteProject = async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid project ID',
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({
        success: false,
        data: null,
        message: 'Project not found',
      });
    }

    await project.deleteOne();
    return res.status(200).json({
      success: true,
      data: null,
      message: 'Project deleted successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to delete project',
    });
  }
};
