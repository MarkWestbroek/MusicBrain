################################################################################
# Automatically-generated file. Do not edit!
################################################################################

# Add inputs and outputs from these tool invocations to the build variables 
C_SRCS += \
B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src\utility\twi.c 

C_DEPS += \
.\libraries\Wire\src\utility\twi.c.d 

LINK_OBJ += \
.\libraries\Wire\src\utility\twi.c.o 


# Each subdirectory must supply rules for building sources it contributes
libraries\Wire\src\utility\twi.c.o: B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src\utility\twi.c
	@echo 'Building file: $<'
	@echo 'Start de C bouw'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-gcc" -c -g -Os -Wall -Wextra -std=gnu11 -ffunction-sections -fdata-sections -MMD -flto -fno-fat-lto-objects -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10812 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR     -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\cores\arduino" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\variants\standard" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src" -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -D__IN_ECLIPSE__=1 "$<"   -o "$@"
	@echo 'Finished building: $<'
	@echo ' '


