"use client";

import React, { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

/* ========= HOUSE CONFIG - Easy adjustments =========== */
const HOUSE_CONFIG = {
    // Scale settings
    baseScale: 0.16,        // Base scale for the house model (increase to make bigger)
    mobileScale: 0.42,      // Mobile-specific scale (< 768px) - smaller for mobile screens

    // Position settings  
    heightOffset: -2.02,      // How far down from tie point (more negative = lower)
    horizontalOffset: -.13,      // How far left/right from tie point (negative = left, positive = right)

    // Mobile-specific position adjustments
    mobileHeightOffset: -3.78,    // Mobile height offset (less negative = higher up)
    mobileHorizontalOffset: -.3,   // Mobile horizontal offset

    // Phone-specific configurations (width x height)
    phoneConfigs: {
        "414x896": {  // iPhone 11, XR
            scale: 0.38,
            heightOffset: -3.5,
            horizontalOffset: -0.18,
            tiltAngle: 0.18,
            bobAmount: 0.009,
            swayAmount: 0.28,
        },
        // Add more specific phone sizes here as needed
        // "390x844": { ... },  // iPhone 12/13/14
        // "428x926": { ... },  // iPhone 12/13/14 Plus/Pro Max
    },

    // Rotation settings
    tiltAngle: 0.25,            // Up/down tilt in radians (positive = tilt up, negative = tilt down)
    mobileTiltAngle: 0.15,      // Mobile-specific tilt angle (less dramatic)

    // Animation settings
    bobAmount: 0.01,         // How much vertical bobbing (0 = no bobbing)
    bobSpeed: 0.5,           // Speed of bobbing animation
    swayAmount: 0.32,        // How much left/right swaying in radians (~30 degrees each way = 60° total)
    swaySpeed: 0.5,          // Speed of swaying animation

    // Mobile animation adjustments
    mobileBobAmount: 0.008,     // Gentler bobbing on mobile
    mobileSwayAmount: 0.25,     // Less swaying on mobile

    // Visual effects
    blurAmount: 0,           // Blur effect in pixels (0 = no blur, higher = more blur)
    mobileBlurAmount: 0,     // Mobile-specific blur amount
} as const;

// Helper function to get phone-specific config
const getPhoneConfig = (screenWidth: number, screenHeight: number, isMobile: boolean) => {
    const screenKey = `${screenWidth}x${screenHeight}`;

    // Check for exact phone match first
    if (HOUSE_CONFIG.phoneConfigs[screenKey as keyof typeof HOUSE_CONFIG.phoneConfigs]) {
        return HOUSE_CONFIG.phoneConfigs[screenKey as keyof typeof HOUSE_CONFIG.phoneConfigs];
    }

    // Fallback to mobile/desktop config
    return {
        scale: isMobile ? HOUSE_CONFIG.mobileScale : HOUSE_CONFIG.baseScale,
        heightOffset: isMobile ? HOUSE_CONFIG.mobileHeightOffset : HOUSE_CONFIG.heightOffset,
        horizontalOffset: isMobile ? HOUSE_CONFIG.mobileHorizontalOffset : HOUSE_CONFIG.horizontalOffset,
        tiltAngle: isMobile ? HOUSE_CONFIG.mobileTiltAngle : HOUSE_CONFIG.tiltAngle,
        bobAmount: isMobile ? HOUSE_CONFIG.mobileBobAmount : HOUSE_CONFIG.bobAmount,
        swayAmount: isMobile ? HOUSE_CONFIG.mobileSwayAmount : HOUSE_CONFIG.swayAmount,
    };
};
/* ================================================== */

interface Props {
    scaleFactor?: number;
    position?: [number, number, number];
    isMobile?: boolean;
    screenWidth?: number;
    screenHeight?: number;
}

export default function HouseGLB({
    scaleFactor = 1,
    position = [0, 0, 0],
    isMobile = false,
    screenWidth = 1024,
    screenHeight = 768
}: Props) {
    const { scene } = useGLTF("/models/house.glb");
    const houseRef = useRef<THREE.Object3D>(null!);

    // Get phone-specific or mobile-aware configuration values
    const phoneConfig = getPhoneConfig(screenWidth, screenHeight, isMobile);

    // CLEANUP: dispose geometries & materials on unmount
    useEffect(() => {
        return () => {
            scene.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                    const mesh = obj as THREE.Mesh;
                    mesh.geometry.dispose();
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach((m) => m.dispose());
                    } else {
                        mesh.material.dispose();
                    }
                }
            });
        };
    }, [scene]);

    // Setup model scaling and positioning
    useEffect(() => {
        if (houseRef.current) {
            // Apply phone-specific scaling
            scene.scale.setScalar(phoneConfig.scale * scaleFactor);

            // Center the model
            const box = new THREE.Box3().setFromObject(scene);
            const center = box.getCenter(new THREE.Vector3());
            scene.position.sub(center);

            // Position the house at the anchor point
            houseRef.current.position.set(...position);
        }
    }, [scene, scaleFactor, position, phoneConfig]);

    // Floating animation with phone-specific settings
    useFrame((state) => {
        if (houseRef.current) {
            const time = state.clock.getElapsedTime();
            // Apply phone-specific positioning and animation
            houseRef.current.position.y = position[1] + phoneConfig.heightOffset + Math.sin(time * HOUSE_CONFIG.bobSpeed) * phoneConfig.bobAmount;
            houseRef.current.position.x = position[0] + phoneConfig.horizontalOffset;
            houseRef.current.rotation.y = Math.sin(time * HOUSE_CONFIG.swaySpeed) * phoneConfig.swayAmount;
            houseRef.current.rotation.x = phoneConfig.tiltAngle;
        }
    });

    return (
        <primitive
            ref={houseRef}
            object={scene}
        />
    );
}

// Export config for use in HouseScene
export { HOUSE_CONFIG };

// Preload for performance
useGLTF.preload("/models/house.glb"); 