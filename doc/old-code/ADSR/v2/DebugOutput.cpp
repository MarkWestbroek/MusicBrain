///////////////////////////////////////////////////////////
//  DebugOutput.cpp
//  Implementation of the Class DebugOutput
//  Created on:      15-mrt-2021 00:55:01
//  Original author: Mark
///////////////////////////////////////////////////////////

#include "Arduino.h"
#include "DebugOutput.h"
#include "Channel.h"



DebugOutput::DebugOutput(){
	mChannel = SerialPort;
}


DebugOutput::DebugOutput(Channel channel){
	mChannel = channel;
}


DebugOutput::~DebugOutput(){

}


/**
 * Output a string variable's value preceded by it's name name should be a
 * constant string
 */
void DebugOutput::Var(const char* name, String value){

}


/**
 * Output a integer variable's value preceded by it's name name should be a
 * constant string
 */
void DebugOutput::Var(const char* name, int value){

}


/**
 * Output a char variable's value preceded by it's name name should be a constant
 * string
 */
void DebugOutput::Var(const char* name, float value){

}


/**
 * Output a char variable's value preceded by it's name name should be a constant
 * string
 */
void DebugOutput::Var(const char* name, char value){

}


void DebugOutput::SetChannel(Channel channel){
	mChannel = channel;
}


Channel DebugOutput::GetChannel(){
	return mChannel;
}
