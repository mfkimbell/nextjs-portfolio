"use client";

import React, { useRef, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import HouseGLB, { HOUSE_CONFIG } from "./HouseGLB";

interface Props {
    scaleFactor: number;
    containerWidth: number;
    containerHeight: number;
    centerX: number;
    tieY: number;
}

export default function HouseScene({ scaleFactor, containerWidth, containerHeight, centerX, tieY }: Props) {
    const containerRef = useRef<HTMLDivElement>(null!);
    const [isMobile, setIsMobile] = useState(false);
    const [screenDimensions, setScreenDimensions] = useState({ width: 1024, height: 768 });

    // Detect mobile view and screen dimensions
    useEffect(() => {
        const updateScreenInfo = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            setIsMobile(width < 768);
            setScreenDimensions({ width, height });
        };

        // Check on mount
        updateScreenInfo();

        // Listen for resize events
        window.addEventListener('resize', updateScreenInfo);
        return () => window.removeEventListener('resize', updateScreenInfo);
    }, []);

    // Get mobile-aware blur amount
    const currentBlurAmount = isMobile ? HOUSE_CONFIG.mobileBlurAmount : HOUSE_CONFIG.blurAmount;

    return (
        <div
            ref={containerRef}
            className="absolute pointer-events-none z-[-1]"
            style={{
                width: `${containerWidth}px`,
                height: `${containerHeight}px`,
                left: 0,
                top: 0,
            }}
        >
            <Canvas
                camera={{ position: [0, -2, 12], fov: 75 }} // Move camera further back and down for very low house
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    filter: `blur(${currentBlurAmount}px)` // Apply mobile-aware blur effect
                }}
            >
                <ambientLight intensity={1.2} />
                <directionalLight
                    position={[5, 10, 5]}
                    intensity={2.0}
                    color="#7fcfff"
                    castShadow
                />
                <HouseGLB
                    scaleFactor={scaleFactor}
                    isMobile={isMobile}
                    screenWidth={screenDimensions.width}
                    screenHeight={screenDimensions.height}
                    position={[
                        (centerX - containerWidth / 2) * 0.008, // Convert to 3D coordinates
                        -(tieY - containerHeight / 2) * 0.008,   // Convert to 3D coordinates (inverted Y)
                        0
                    ]}
                />
            </Canvas>
        </div>
    );
} 