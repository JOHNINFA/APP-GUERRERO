import React from 'react';
import { TouchableOpacity } from 'react-native';

/**
 * TouchableOpacity optimizado para respuesta rápida
 * - activeOpacity: Feedback visual inmediato
 * - delayPressIn: Sin delay al tocar
 */
const FastTouchable = ({ children, activeOpacity = 0.6, delayPressIn = 0, ...props }) => {
    return (
        <TouchableOpacity
            activeOpacity={activeOpacity}
            delayPressIn={delayPressIn}
            {...props}
        >
            {children}
        </TouchableOpacity>
    );
};

export default FastTouchable;
