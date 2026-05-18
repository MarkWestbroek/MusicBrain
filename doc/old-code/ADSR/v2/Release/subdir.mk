################################################################################
# Automatically-generated file. Do not edit!
################################################################################

# Add inputs and outputs from these tool invocations to the build variables 
CPP_SRCS += \
..\DebugOutput.cpp \
..\EnvelopeController.cpp \
..\Global.cpp \
..\SessionDebugOutput.cpp \
..\sloeber.ino.cpp 

LINK_OBJ += \
.\DebugOutput.cpp.o \
.\EnvelopeController.cpp.o \
.\Global.cpp.o \
.\SessionDebugOutput.cpp.o \
.\sloeber.ino.cpp.o 

CPP_DEPS += \
.\DebugOutput.cpp.d \
.\EnvelopeController.cpp.d \
.\Global.cpp.d \
.\SessionDebugOutput.cpp.d \
.\sloeber.ino.cpp.d 


# Each subdirectory must supply rules for building sources it contributes
DebugOutput.cpp.o: ..\DebugOutput.cpp
	@echo 'Building file: $<'
	@echo 'Start de C++ bouw'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-g++" -c -g -Os -Wall -Wextra -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -flto -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10812 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR     -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\cores\arduino" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\variants\standard" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src" -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -D__IN_ECLIPSE__=1 -x c++ "$<"   -o "$@"
	@echo 'Finished building: $<'
	@echo ' '

EnvelopeController.cpp.o: ..\EnvelopeController.cpp
	@echo 'Building file: $<'
	@echo 'Start de C++ bouw'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-g++" -c -g -Os -Wall -Wextra -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -flto -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10812 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR     -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\cores\arduino" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\variants\standard" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src" -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -D__IN_ECLIPSE__=1 -x c++ "$<"   -o "$@"
	@echo 'Finished building: $<'
	@echo ' '

Global.cpp.o: ..\Global.cpp
	@echo 'Building file: $<'
	@echo 'Start de C++ bouw'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-g++" -c -g -Os -Wall -Wextra -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -flto -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10812 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR     -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\cores\arduino" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\variants\standard" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src" -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -D__IN_ECLIPSE__=1 -x c++ "$<"   -o "$@"
	@echo 'Finished building: $<'
	@echo ' '

SessionDebugOutput.cpp.o: ..\SessionDebugOutput.cpp
	@echo 'Building file: $<'
	@echo 'Start de C++ bouw'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-g++" -c -g -Os -Wall -Wextra -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -flto -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10812 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR     -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\cores\arduino" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\variants\standard" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src" -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -D__IN_ECLIPSE__=1 -x c++ "$<"   -o "$@"
	@echo 'Finished building: $<'
	@echo ' '

sloeber.ino.cpp.o: ..\sloeber.ino.cpp
	@echo 'Building file: $<'
	@echo 'Start de C++ bouw'
	"B:\eclipse\arduinoPlugin\packages\arduino\tools\avr-gcc\7.3.0-atmel3.6.1-arduino7/bin/avr-g++" -c -g -Os -Wall -Wextra -std=gnu++11 -fpermissive -fno-exceptions -ffunction-sections -fdata-sections -fno-threadsafe-statics -Wno-error=narrowing -MMD -flto -mmcu=atmega328p -DF_CPU=16000000L -DARDUINO=10812 -DARDUINO_AVR_UNO -DARDUINO_ARCH_AVR     -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\cores\arduino" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\variants\standard" -I"B:\eclipse\arduinoPlugin\packages\arduino\hardware\avr\1.8.3\libraries\Wire\src" -MMD -MP -MF"$(@:%.o=%.d)" -MT"$(@)" -D__IN_ECLIPSE__=1 -x c++ "$<"   -o "$@"

	@echo 'Finished building: $<'
	@echo ' '


