import * as assert from 'assert';
import { TaskAwareVisionOptimizer } from '../../src/vision/taskAwareVision';

export function runPhase24VisionOptimizationValidation(): boolean {
    console.log('--- Phase 24: Task-Aware Vision & Multimodal Image Optimization ---');

    const vision = new TaskAwareVisionOptimizer();
    const plan = vision.planImageOptimization({
        width: 3840,
        height: 2160,
        imageType: 'architecture_diagram'
    });

    assert.ok(plan.targetWidth <= 1024, 'Diagrams must be downscaled to reasonable resolution');
    assert.ok(plan.tokensSaved > 0, 'Image optimization must save estimated multimodal tokens');

    console.log('  ✓ Task-aware vision optimization verified.');
    return true;
}
