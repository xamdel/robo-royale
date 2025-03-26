const fs = require('fs').promises;
const path = require('path');
const { Document, NodeIO } = require('@gltf-transform/core');
const { vec3, mat4 } = require('gl-matrix'); // Import gl-matrix

async function extractCollisionData() {
    try {
        // Path to the GLB file
        const modelPath = path.resolve(__dirname, '../assets/models/world.glb');
        
        // Read the GLB file
        const io = new NodeIO();
        const document = await io.read(modelPath);
        // Find the node with name 'World_Collision'
        let collisionNode = null;
        let collisionPrimitive = null;

        document.getRoot().listNodes().forEach((node) => {
            if (node.getName() === 'World_Collision') {
                collisionNode = node; // Store the node itself
                const mesh = node.getMesh();
                if (mesh) {
                    collisionPrimitive = mesh.listPrimitives()[0];
                }
            }
        });

        if (!collisionNode || !collisionPrimitive) {
            throw new Error('Could not find World_Collision node or its primitive in GLB file');
        }
        
        // Get position attribute and indices
        const positionAccessor = collisionPrimitive.getAttribute('POSITION');
        const indicesAccessor = collisionPrimitive.getIndices();
        
        if (!positionAccessor || !indicesAccessor) {
            throw new Error('Mesh does not have required attributes');
        }
        // Extract the data
        const positions = positionAccessor.getArray(); // Raw vertex data
        const indices = indicesAccessor.getArray();

        // Get the world matrix for the collision node
        const worldMatrix = collisionNode.getWorldMatrix();
        console.log('World Matrix for World_Collision:', worldMatrix);

        // Transform vertices by the world matrix
        const transformedVertices = [];
        const tempVec = vec3.create(); // Temporary vector for calculations

        for (let i = 0; i < positions.length; i += 3) {
            // Set the temporary vector with the raw vertex position
            vec3.set(tempVec, positions[i], positions[i + 1], positions[i + 2]);
            // Apply the world transformation
            vec3.transformMat4(tempVec, tempVec, worldMatrix);
            // Push the transformed coordinates to the new array
            transformedVertices.push(tempVec[0], tempVec[1], tempVec[2]);
        }

        // Create the output data structure with transformed vertices
        const collisionData = {
            vertices: transformedVertices, // Use the transformed vertices
            indices: Array.from(indices)
        };
        
        // Create output directory if it doesn't exist
        const outputDir = path.resolve(__dirname, '../server/assets');
        await fs.mkdir(outputDir, { recursive: true });
        
        // Write to server assets directory
        const outputPath = path.resolve(outputDir, 'world-collision.json');
        await fs.writeFile(
            outputPath,
            JSON.stringify(collisionData, null, 2)
        );
        
        console.log('Successfully extracted collision data to:', outputPath);
    } catch (error) {
        console.error('Error extracting collision data:', error);
        if (error.stack) console.error(error.stack);
    }
}

extractCollisionData();
