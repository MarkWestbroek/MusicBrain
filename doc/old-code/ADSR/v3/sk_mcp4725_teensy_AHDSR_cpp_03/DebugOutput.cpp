/*
 * DebugOutput.cpp
 *
 *  Created on: 13 mrt. 2021
 *      Author: Mark
 */

#include "DebugOutput.h"
#include "Arduino.h"

DebugOutput::DebugOutput() {
	// TODO Auto-generated constructor stub
	mDebug = true;
}

DebugOutput::DebugOutput(bool debug) {
	// TODO Auto-generated constructor stub
	mDebug = debug;
}

DebugOutput::~DebugOutput() {
	// TODO Auto-generated destructor stub
}

/*
 * Output a string variable's value preceded by it's name
 * name should be a constant string
 */
void DebugOutput::Var(const char* name, String value){
	String o = name;
	o += " = ";
	o += value;
	Serial.println(o);
}

/*
 * Output a integer variable's value preceded by it's name
 * name should be a constant string
 */
void DebugOutput::Var(const char* name, int value){
	String valueAsString = String(value);
	Var(name, valueAsString);
}

/*
 * Output a char variable's value preceded by it's name
 * name should be a constant string
 */
void DebugOutput::Var(const char* name, char value){
	//char* valueAsString = value;
	Var(name, value);
}

void DebugOutput::SetDebug(bool debug){
	mDebug = debug;
}

bool DebugOutput::GetDebug(){
	return mDebug;
}
