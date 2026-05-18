/*
 * DebugOutput.cpp
 *
 *  Created on: 13 mrt. 2021
 *      Author: Mark
 */

#include "Arduino.h"
#include "Channel.h"
#include "SessionDebugOutput.h"

SessionDebugOutput::SessionDebugOutput() {
	// TODO Auto-generated constructor stub
	mDebug = true;
}

SessionDebugOutput::SessionDebugOutput(bool debug) {
	// TODO Auto-generated constructor stub
	mDebug = debug;
}

SessionDebugOutput::~SessionDebugOutput() {
	// TODO Auto-generated destructor stub
}

/*
 * Output a string variable's value preceded by it's name
 * name should be a constant string
 */
void SessionDebugOutput::Var(const char* name, String value){
	String o = name;
	o += " = ";
	o += value;
	Serial.println(o);
}

/*
 * Output a integer variable's value preceded by it's name
 * name should be a constant string
 */
void SessionDebugOutput::Var(const char* name, int value){
	String valueAsString = String(value);
	Var(name, valueAsString);
}

/**
 * Output a char variable's value preceded by it's name name should be a constant
 * string
 */
void SessionDebugOutput::Var(const char* name, float value){
	String valueAsString = String(value);
	Var(name, valueAsString);
}

/*
 * Output a char variable's value preceded by it's name
 * name should be a constant string
 */
void SessionDebugOutput::Var(const char* name, char value){
	//char* valueAsString = value;
	Var(name, value);
}

void SessionDebugOutput::SetDebug(bool debug){
	mDebug = debug;
}

bool SessionDebugOutput::GetDebug(){
	return mDebug;
}
